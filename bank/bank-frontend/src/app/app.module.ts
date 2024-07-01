import { NgModule } from '@angular/core';

import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HomeComponent } from './home.component';
import { BankComponent } from './bank.component';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { FormsModule } from "@angular/forms";
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { OwnerNameDialogComponent } from './owner-name-dialog/owner-name-dialog.component';

@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    BankComponent,
    OwnerNameDialogComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,

    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,

    AppRoutingModule,
    HttpClientModule,
    RouterModule.forRoot([
      {path: '', component: HomeComponent, pathMatch: 'full'}], {onSameUrlNavigation: 'reload'}),
    FormsModule,
  ],
  providers: [
    provideAnimationsAsync()
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
