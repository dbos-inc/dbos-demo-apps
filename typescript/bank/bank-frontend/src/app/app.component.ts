import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  template: `<nav class="navbar navbar-expand-lg navbar-light bg-light">
  <div class="container-fluid">
      <a class="navbar-brand" href="/">Bank of DBOS</a>
  </div>
</nav>
<router-outlet></router-outlet>`
})
export class AppComponent {
  title = 'dbosBankOauthApp';
}
