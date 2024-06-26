import {Component} from '@angular/core';
import { AppService } from './app.service';
import  { environment } from "../environments/environment";

@Component({
  selector: 'home-header',
  providers: [AppService],
  template: `
<div class="container" xmlns="http://www.w3.org/1999/html">
    <div *ngIf="!isLoggedIn" class="jumbotron">
      <h1>Welcome to Bank of DBOS!</h1>
      <button class="btn btn-primary" (click)="login()" type="submit">Login</button>
    </div>
    <div *ngIf="isLoggedIn">
      <div class="jumbotron">
        <h1>Welcome {{getUser()}}!</h1>
        <div class="btn-group">
          <button type="button" class="btn btn-info dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
            Select a Bank Branch / Action
          </button>
          <div class="dropdown-menu">
            <a class="dropdown-item" *ngFor="let host of _service.bankHosts; index as i"role="button" (click)="selectBank(i+1, host)" href="#">Branch-{{i+1}}: {{host}}</a>
            <div class="dropdown-divider"></div>
            <a class="dropdown-item" (click)="refreshLogin()" href="#" role="button">Refresh</a>
            <a class="dropdown-item" (click)="logout()" href="#" role="button">Logout</a>
          </div>
        </div>
      </div>
      <bank-details *ngIf="selectedBankId && selectBankHost"  [bankUrl]="selectBankHost" [bankId]="selectedBankId"></bank-details>
    </div>
</div>`
})

export class HomeComponent {
  public isLoggedIn = false;
  selectedBankId: number = 1;
  selectBankHost: string = this._service.bankHosts[0];

  constructor(public _service:AppService){}

  ngOnInit(){
    this.isLoggedIn = this._service.checkCredentials();
    const i = window.location.href.indexOf('code');
    if (!this.isLoggedIn && i != -1){
      this._service.retrieveToken(window.location.href.substring(i + 5));
    }
  }

  selectBank(bankId: number, bankHost: string) {
    this.selectedBankId = bankId;
    this.selectBankHost = bankHost;
  }

  login() {
    window.location.href = environment.authUrl + '/auth?response_type=code&&scope=openid&client_id=' +
          this._service.clientId + '&redirect_uri='+ this._service.redirectUri;
  }

  logout() {
    this._service.logout();
  }

  getUser() {
    const userName = this._service.getPayloads().preferred_username;
    return userName;
  }

  refreshLogin() {
    this._service.logoutOnError();
    window.location.href = environment.authUrl + '/auth?response_type=code&&scope=openid&client_id=' +
        this._service.clientId + '&redirect_uri='+ this._service.redirectUri;
  }
}
