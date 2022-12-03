import './polyfills';

import { enableProdMode, NgModule, NgModuleRef } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

declare interface NgHolder {
  ngRef: NgModuleRef<AppModule>;
}

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .then((ref) => {
    // Ensure Angular destroys itself on hot reloads.
    const w = window as unknown as NgHolder;
    if (w['ngRef']) {
      w['ngRef'].destroy();
    }
    w['ngRef'] = ref;

    // Otherwise, log the boot error
  })
  .catch((err) => console.error(err));
