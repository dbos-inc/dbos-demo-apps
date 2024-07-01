import {Injectable} from '@angular/core';
import { Cookie } from 'ng2-cookies';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { JwtHelperService } from "@auth0/angular-jwt";
import {environment} from "../environments/environment";

export class BankAccountInfo {
  constructor(public account_id: number,
              public balance: number,
              public type: string,
              public owner_name: string) {}
}

export class TransactionHistory {
  constructor(public txn_id: number,
              public from_account_id: number,
              public from_location: string,
              public to_account_id: number,
              public to_location: string,
              public amount: number,
              public timestamp: string) {
  }
}

@Injectable()
export class AppService {
  public jwtHelper = new JwtHelperService();
  public clientId = 'newClient';
  public redirectUri = environment.redirectUrl;
  public bankHosts: string[] = environment.bankHosts;

  constructor(
    private _http: HttpClient){}

  retrieveToken(code: string){
    const params = new URLSearchParams();
    params.append('grant_type','authorization_code');
    params.append('client_id', this.clientId);
    params.append('redirect_uri', this.redirectUri);
    params.append('code',code);

    const headers = new HttpHeaders({'Content-type': 'application/x-www-form-urlencoded; charset=utf-8'});
    this._http.post(environment.authUrl + '/token', params.toString(), { headers: headers })
      .subscribe({
        next: (data) => this.saveToken(data as string),
        error: (err) => { console.log(err); alert('Invalid Credentials')}
      });
  }

  saveToken(token: any){
    const expireDate = new Date().getTime() + (1000 * token.expires_in);
    Cookie.set("access_token", token.access_token, expireDate);
    Cookie.set("id_token", token.id_token, expireDate);
    console.log('Obtained Access token');
    window.location.href = this.redirectUri;
  }

  getResource(resourceUrl: string) : Observable<any>{
    const headers = new HttpHeaders({'Content-type': 'application/x-www-form-urlencoded; charset=utf-8', 'Authorization': 'Bearer '+Cookie.get('access_token')});
    return this._http.get(resourceUrl, { headers: headers, responseType: 'text' as 'json' }).pipe(
      catchError((error) => { return throwError(() => {return error.json().error || 'Server error'})})
    );
  }

  postResource(resourceUrl: string, inputData: any) : Observable<any>{
    const headers = new HttpHeaders({'Content-type': 'application/json; charset=utf-8', 'Accept': 'application/json', 'Authorization': 'Bearer '+Cookie.get('access_token')});
    return this._http.post(resourceUrl, inputData, { headers: headers, responseType: 'text' as 'json' }).pipe(
      catchError((error) => { return throwError(() => {return error.json().error || 'Server error'})})
    );
  }

  checkCredentials(){
    return Cookie.check('access_token');
  }

  logout() {
    const token = Cookie.get('id_token');
    Cookie.delete('access_token');
    Cookie.delete('id_token');
    const logoutURL = environment.authUrl + "/logout?id_token_hint="
      + token
      + "&post_logout_redirect_uri=" + this.redirectUri;

    window.location.href = logoutURL;
  }

  // Force to logout. Mostly because session expires.
  logoutOnError() {
    Cookie.delete('access_token');
    Cookie.delete('id_token');
  }

  getPayloads() {
    const token = Cookie.get("access_token");
    const payload = this.jwtHelper.decodeToken(token);
    console.log(JSON.stringify(payload));
    return payload;
  }
}
