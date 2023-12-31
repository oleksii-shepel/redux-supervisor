import { Action, AsyncAction, Reducer, StoreCreator, StoreEnhancer, kindOf } from "redux-replica";
import { BehaviorSubject, Observable, ReplaySubject, concatMap, isObservable, of, scan, shareReplay, tap, withLatestFrom } from "rxjs";
import { runSideEffectsSequentially } from "./effects";
import { EnhancedStore, FeatureModule, MainModule, Store } from "./types";

const actions = {
  INIT_STORE: 'INIT_STORE',
  LOAD_MODULE: 'LOAD_MODULE',
  UNLOAD_MODULE: 'UNLOAD_MODULE',
  APPLY_MIDDLEWARES: 'APPLY_MIDDLEWARES',
  REGISTER_EFFECTS: 'REGISTER_EFFECTS',
  UNREGISTER_EFFECTS: 'UNREGISTER_EFFECTS'
};

// Define the action creators
const actionCreators = {
  initStore: () => ({ type: actions.INIT_STORE }),
  applyMiddlewares: () => ({ type: actions.APPLY_MIDDLEWARES }),
  registerEffects: () => ({ type: actions.REGISTER_EFFECTS }),
  loadModule: (module: FeatureModule) => ({ type: actions.LOAD_MODULE, payload: module }),
  unloadModule: (module: FeatureModule) => ({ type: actions.UNLOAD_MODULE, payload: module }),
  unregisterEffects: (module: FeatureModule) => ({ type: actions.UNREGISTER_EFFECTS, payload: module }),
};

export function supervisor(mainModule: MainModule) {

  function init(store: EnhancedStore) {
    return (module: MainModule) => initStore(store, module);
  }

  function load(store: EnhancedStore) {
    return (module: FeatureModule) => loadModule(store, module);
  }

  function unload(store: EnhancedStore) {
    return (module: FeatureModule) => unloadModule(store, module);
  }

  return (createStore: StoreCreator) => (reducer: Reducer, preloadedState?: any, enhancer?: StoreEnhancer) => {
    let store = createStore(reducer, preloadedState, enhancer) as EnhancedStore;

    store = init(store)(mainModule);
    store = patchDispatch(store);
    store = registerEffects(store);

    let middlewares = applyMiddleware(store);

    let action$ = store.actionStream.asObservable();
    let state$ = action$.pipe(
      concatMap(action => action),
      tap(console.log),
      concatMap(action => middlewares(action)),
      tap(() => store.isDispatching = true),
      scan((state, action) => store.pipeline.reducer(state, action), store.currentState.value),
      tap(() => store.isDispatching = false),
      shareReplay(1)
    );

    let subscription = action$.pipe(
      withLatestFrom(state$),
      concatMap(runSideEffectsSequentially(store.pipeline.effects)),
      tap((action) => store.dispatch(action))
    ).subscribe();

    store.dispatch(actionCreators.initStore());

    return {
      subscription,
      initStore: init,
      loadModule: load,
      unloadModule: unload,
      dispatch: store.dispatch,
      getState: store.getState,
      addReducer: store.addReducer,
      subscribe: store.subscribe
    };
  };
}

function initStore(store: Store, mainModule: MainModule): EnhancedStore {

  const MAIN_MODULE_DEFAULT = {
    middlewares: [],
    reducer: (state: any = {}, action: Action<any>) => state,
    effects: []
  };

  const MODULES_DEFAULT: FeatureModule[] = [];

  const PIPELINE_DEFAULT = {
    middlewares: [],
    reducer: (state: any = {}, action: Action<any>) => state,
    effects: []
  };

  const ACTION_STREAM_DEFAULT = new ReplaySubject<Observable<Action<any>>>();

  const CURRENT_STATE_DEFAULT = new BehaviorSubject<any>({});

  const DISPATCHING_DEFAULT = false;

  return {
    ...store,
    initStore: () => { throw new Error('initStore method is not defined'); },
    loadModule: () =>  { throw new Error('loadModule method is not defined'); },
    unloadModule: () => { throw new Error('unloadModule method is not defined'); },
    mainModule: Object.assign(MAIN_MODULE_DEFAULT, mainModule),
    modules: MODULES_DEFAULT,
    pipeline: Object.assign(PIPELINE_DEFAULT, mainModule),
    actionStream: ACTION_STREAM_DEFAULT,
    currentState: CURRENT_STATE_DEFAULT,
    isDispatching: DISPATCHING_DEFAULT
  };
};

function loadModule(store: EnhancedStore, module: FeatureModule): EnhancedStore {
  // Check if the module already exists in the store's modules
  if (store.modules.some(m => m.slice === module.slice)) {
    // If the module already exists, return the store without changes
    return store;
  }

  store = setupReducer(store);

  // Create a new array with the module added to the store's modules
  const newModules = [...store.modules, module];

  // Register the module's effects
  const newEffects = [...store.pipeline.effects, ...module.effects];

  // Return a new store with the updated properties
  return { ...store, modules: newModules, pipeline: {...store.pipeline, effects: newEffects }};
}

function unloadModule(store: EnhancedStore, module: FeatureModule): EnhancedStore {
  // Create a new array with the module removed from the store's modules
  const newModules = store.modules.filter(m => m.slice !== module.slice);

  // Setup the reducers
  store = setupReducer(store);

  // Unregister the module's effects
  store = unregisterEffects(store, module);

  // Return a new store with the updated properties
  return { ...store };
}

function registerEffects(store: EnhancedStore): EnhancedStore  {
  // Iterate over each module and add its effects to the pipeline
  let effects = store.mainModule.effects ? [...store.mainModule.effects] : [];
  for (const module of store.modules) {
    effects.push(...module.effects);
  }

  return { ...store, pipeline: { ...store.pipeline, effects } };
}

function unregisterEffects(store: EnhancedStore, module: FeatureModule): EnhancedStore {
  // Create a new array excluding the effects of the module to be unloaded
  const remainingEffects = store.pipeline.effects.filter(effect => !module.effects.includes(effect));

  // Return the array of remaining effects
  return { ...store, pipeline: { ...store.pipeline, effects: remainingEffects } };
}

function setupReducer(store: EnhancedStore): EnhancedStore {
  // Get the main module reducer
  const mainReducer = store.mainModule.reducer;

  // Get the feature module reducers
  const featureReducers = store.modules.reduce((reducers, module) => {
    reducers[module.slice] = module.reducer;
    return reducers;
  }, {} as Record<string, Reducer>);

  // Combine the main module reducer with the feature module reducers
  const combinedReducer = (state: any, action: Action<any>) => {
    let newState = mainReducer(state, action);

    Object.keys(featureReducers).forEach((key) => {
      newState[key] = featureReducers[key];
    });

    return newState;
  };

  return { ...store, pipeline: { ...store.pipeline, reducer: combinedReducer }};
}

function patchDispatch(store: EnhancedStore): EnhancedStore {
  let result = { ...store };

  result.dispatch = (action: Action<any> | AsyncAction<any>) => {
    // If action is of type Action<any>, return Observable of action
    if (typeof action === 'object' && (action as any)?.type) {
      result.actionStream.next(of(action));
    } else if (typeof action === 'function') {
      action(result.dispatch, result.getState);
    } else {
      throw new Error(`Expected the action to be an object with a 'type' property or a function. Instead, received: '${kindOf(action)}'`);
    }
  };

  return result;
}


function applyMiddleware(store: EnhancedStore) {
  const cachedProcessors = store.pipeline.middlewares.map(processor => processor(store));
  return (action: Action<any>) => {
    const chain = cachedProcessors.reduceRight((next, processor) => {
      return (innerAction: Action<any>) => {
        const result = processor(next)(innerAction);
        return isObservable(result) ? result : of(result);
      };
    }, (innerAction: Action<any>) => of(innerAction)); // Wrap the action in an Observable
    let result = chain(action);
    return result;
  };
}


