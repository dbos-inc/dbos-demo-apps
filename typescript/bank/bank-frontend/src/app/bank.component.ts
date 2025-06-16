import { Component, Input, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { AppService } from './app.service';
import { BankAccountInfo, TransactionHistory } from './app.service';
import { OwnerNameDialogComponent } from './owner-name-dialog/owner-name-dialog.component';

@Component({
  selector: 'bank-details',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    OwnerNameDialogComponent,
  ],
  providers: [AppService],
  templateUrl: './bank.component.html' // recommend extracting to .html
})
export class BankComponent {
  bankmsg = 'empty';
  accounts: BankAccountInfo[] = [];
  ownerName = 'empty';
  userRole = 'empty';
  txnHistory: TransactionHistory[] = [];
  txnHistoryAccount: number = -1;

  @Input() bankUrl: string | undefined;
  @Input() bankId: number | undefined;

  amount: number = 0.0;
  selectedTransferAccount: number = -1;
  selectedTransferSource: string = 'cash';
  externalAccountId: number = -1;

  constructor(private dialog: MatDialog, public _service: AppService) {}

  ngOnInit() {
    this.getMsg();
    const payload = this._service.getPayloads();
    this.ownerName = payload.preferred_username;
    this.userRole = payload.realm_access.roles[0];
    this.txnHistory = [];
    this.txnHistoryAccount = -1;
    this.accounts = [];
    this.getAccounts();
  }

  ngOnChanges(changes: SimpleChanges) {
    console.log(changes);
    this.ngOnInit();
  }

  getMsg(){
    const url = '/api/greeting';
    this._service.getResource(this.bankUrl + url)
      .subscribe(
        {
          next: (data: any) => this.bankmsg = data.toString(),
          error: (err: any) => { this.bankmsg = 'Error' }
        });
  }

  createNewAccount(): void {
    const dialogRef = this.dialog.open(OwnerNameDialogComponent);

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const newAcct = {
          ownerName: result,
          type: 'checking',
          balance: 0.0,
        };
        this._service.postResource(this.bankUrl + "/api/create_account", JSON.stringify(newAcct))
          .subscribe({
            next: (data: any) => {this.bankmsg = 'Successfully created an account! Account ID: ' + data;
              this.getAccounts();},
            error: (err: any) => { this.bankmsg = 'Failed to create a new account' }
          });
      } else {
        this.bankmsg = 'Account creation cancelled by the user.';
      }
    });
  }

  // List all accounts
  getAccounts(){
    this._service.getResource(this.bankUrl + "/api/list_all_accounts")
      .subscribe({
        next: (data: any) => {
          // this.bankmsg = 'Fetched accounts!'
          const jsonArray = JSON.parse(data);
          this.accounts = jsonArray.map((item: any) => new BankAccountInfo(item.accountId, item.balance, item.type, item.ownerName));
        },
        error: (err: any) => {this.bankmsg = 'Error fetching accounts!';
          this._service.logoutOnError();
          window.location.href = 'http://localhost:8083/realms/dbos/protocol/openid-connect/auth?response_type=code&&scope=openid&client_id=' +
              this._service.clientId + '&redirect_uri='+ this._service.redirectUri;
        }
      });
  }

  // Get transaction history for an account
  getTransactions(accountId: number) {
    this.txnHistoryAccount = accountId;
    this._service.getResource(this.bankUrl + "/api/transaction_history/" + accountId)
      .subscribe({
        next: (data: any) => {this.bankmsg = 'Fetched transaction history!'
          const jsonArray = JSON.parse(data);
          this.txnHistory = jsonArray.map((item: any) => new TransactionHistory(item.txnId, item.fromAccountId,
            item.fromLocation, item.toAccountId, item.toLocation, item.amount, item.timestamp));
        },
        error: (err: any) => { this.bankmsg = 'Error fetching accounts!' }
      });
  }

  setAccountId(accountId: number) {
    this.txnHistoryAccount = accountId;
  }

  deposit(accountId: number) {
    if (this.selectedTransferSource == 'cash') {
      this.externalAccountId = -1;
    }

    // TODO: input validation
    const inputData = {
      fromAccountId: this.externalAccountId,
      fromLocation: this.selectedTransferSource,
      toAccountId: accountId,
      toLocation: 'local',
      amount: this.amount * 100.0,
      uuid: 'depositAngular' + accountId
    }
    this._service.postResource(this.bankUrl + "/api/deposit", JSON.stringify(inputData))
      .subscribe({
        next: (data: any) => {this.bankmsg = 'Successfully made a deposit to Account ID: ' + accountId;
          this.getAccounts();
        },
        error: (err: any) => { this.bankmsg = 'Failed to make a deposit!' }
      });
  }

  withdraw(accountId: number) {
    if (this.selectedTransferSource == 'cash') {
      this.externalAccountId = -1;
    }

    // TODO: input validation
    const inputData = {
      fromAccountId: accountId,
      fromLocation: 'local',
      toAccountId: this.externalAccountId,
      toLocation: this.selectedTransferSource,
      amount: this.amount * 100.0,
      uuid: 'withdrawAngular' + accountId
    }
    this._service.postResource(this.bankUrl + "/api/withdraw", JSON.stringify(inputData))
      .subscribe({
        next: (data: any) => {this.bankmsg = 'Successfully withdraw from Account ID: ' + accountId;
          this.getAccounts();
        },
        error: (err: any) => { this.bankmsg = 'Failed to withdraw! '; }
      });
  }

  transfer(accountId: number, toAccountId: number) {
    // TODO: input validation
    const inputData = {
      fromAccountId: accountId,
      fromLocation: 'local',
      toAccountId: toAccountId,
      toLocation: 'local',
      amount: this.amount * 100.0,
      uuid: 'transferAngular' + accountId
    }
    this._service.postResource(this.bankUrl + "/api/transfer", JSON.stringify(inputData))
      .subscribe({
        next: (data: any) => {this.bankmsg = 'Successfully transfered from Account: ' + accountId + ' to Account: ' + toAccountId;
          this.getAccounts();
        },
        error: (err: any) => { this.bankmsg = 'Failed to transfer! '; }
      });
  }

  //In response to the "Crash" button - for demo purposes
  crashApp(){
    this._service.getResource(this.bankUrl + "/crash_application").subscribe()
  }
}
