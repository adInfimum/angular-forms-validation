import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';

import { AppComponent, TooltipPipe, VisiblePipe } from './app.component';
import { HelloComponent } from './hello.component';

@NgModule({
  imports: [BrowserModule, ReactiveFormsModule],
  declarations: [AppComponent, HelloComponent, VisiblePipe, TooltipPipe],
  bootstrap: [AppComponent],
})
export class AppModule {}
