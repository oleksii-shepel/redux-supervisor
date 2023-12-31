import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';

import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import logger from 'redux-logger';
import { ofType } from 'redux-observable';
import { Action } from 'redux-replica';
import { Observable, map } from 'rxjs';
import { StoreModule } from 'supervisor';
import { AppRoutingModule } from './app-routing.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HeroDetailModule } from './hero-detail/hero-detail.module';
import { HeroesModule } from './heroes/heroes.module';
import { MessagesModule } from './messages/messages.module';


const pingEpic = (action$: Observable<any>) => action$.pipe(
  ofType('PING'),
  map(() => ({ type: 'PONG' }))
);

export function getBaseHref(platformLocation: PlatformLocation): string {
  return platformLocation.getBaseHrefFromDOM();
}


@NgModule({
  providers: [
    {
      provide: APP_BASE_HREF,
      useFactory: getBaseHref,
      deps: [PlatformLocation],
    },
  ],
  imports: [
    StoreModule.forRoot({
      middlewares: [logger],
      reducer: (state: any = {}, action: Action<any>) => state,
      effects: [pingEpic],
    }),
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    DashboardModule,
    HeroesModule,
    HeroDetailModule,
    MessagesModule,

  ],
  declarations: [
    AppComponent
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}

