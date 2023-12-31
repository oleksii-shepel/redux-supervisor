import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { Action } from "redux-replica";
import { StoreModule } from "supervisor";
import { HeroesComponent } from "./heroes.component";


@NgModule({
  imports: [CommonModule, FormsModule, RouterModule, StoreModule.forFeature({
    slice: 'heroes',
    reducer: (state: any = {}, action: Action<any>) => state,
    effects: [],
  })],
  declarations: [
    HeroesComponent,
  ],
  exports: [
    HeroesComponent
  ]
})
export class HeroesModule {}

