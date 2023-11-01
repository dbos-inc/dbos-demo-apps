import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HomeComponent } from './home.component';
import { BankComponent } from './bank.component';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { FormsModule } from "@angular/forms";
import { ApiModule, Configuration, ConfigurationParameters  } from '../client'
import { Cookie } from 'ng2-cookies';

export function apiConfigFactory (): Configuration {
  const params: ConfigurationParameters = {
    basePath: 'http://localhost:8080', // TODO
    // credentials: () => Cookie.get('access_token')
    // set configuration parameters here.
  };
  return new Configuration(params);
}


@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    BankComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    RouterModule.forRoot([
      {path: '', component: HomeComponent, pathMatch: 'full'}], {onSameUrlNavigation: 'reload'}),
    FormsModule,
    ApiModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
