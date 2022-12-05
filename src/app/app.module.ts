import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';

import { AppComponent, PropNamePipe } from './app.component';
import { HelloComponent } from './hello.component';

@NgModule({
  imports: [BrowserModule, ReactiveFormsModule],
  declarations: [AppComponent, HelloComponent, PropNamePipe],
  bootstrap: [AppComponent],
})
export class AppModule {}
