import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule } from '@angular/router';
import { Action } from "redux-replica";
import { StoreModule } from "supervisor";
import { MessagesComponent } from "./messages.component";


@NgModule({
  imports: [CommonModule, FormsModule, RouterModule, StoreModule.forFeature({
    slice: 'messages',
    reducer: (state: any = {}, action: Action<any>) => state,
    effects: [],
  })],
  declarations: [
    MessagesComponent,
  ],
  exports: [
    MessagesComponent
  ]
})
export class MessagesModule {}

