import { Component, Input, SimpleChanges } from '@angular/core';
import { AppService } from './app.service';
import { BankAccountInfo } from "./app.service";
import { TransactionHistory } from "./app.service";

@Component({
  selector: 'bank-details',
  providers: [AppService],
  template: `<div class="container">
      <h2>Bank Branch {{bankId}}</h2>
      <p class="lead text-muted">Hostname: {{bankUrl}}</p>
      <div class="announcement">
          <label><b>Message from Bank: </b></label> <span> {{bankmsg}}</span>
      </div>
      <div class="container-fluid">
          <button class="button-grey" (click)="getMsg()" type="submit">New Greeting Message</button>
          <button  class="button-green" (click)="createNewAccount()" type="submit">Create a New Account</button>
          <button  class="button" (click)="getAccounts()" type="submit">Refresh Accounts</button>

      </div>

      <table class="table table-striped">
        <thead>
          <tr>
            <th>Account ID</th>
            <th>Balance</th>
            <th>Type</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let acct of this.accounts">
            <td>{{acct.account_id}}</td>
            <td>\${{(acct.balance / 100.0).toFixed(2)}}</td>
            <td>{{acct.type}}</td>
            <td>
              <div class="btn-group">
                <button type="button" class="btn btn-outline-success dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                  Choose an Action
                </button>
                <div class="dropdown-menu">
                  <a class="dropdown-item" (click)="getTransactions(acct.account_id)" href="#" role="button" data-toggle="modal" data-target="#transactionHistory" >Transaction History</a>
                  <a class="dropdown-item" (click)="setAccountId(acct.account_id)" href="#" role="button" data-toggle="modal" data-target="#deposit">Deposit</a>
                  <a class="dropdown-item" (click)="setAccountId(acct.account_id)" href="#" role="button" data-toggle="modal" data-target="#withdraw">Withdraw</a>
                  <a class="dropdown-item" (click)="setAccountId(acct.account_id)" href="#" role="button" data-toggle="modal" data-target="#internalTransfer">Internal Transfer</a>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="container">
        <div class="modal fade" id="transactionHistory" tabindex="-1" role="dialog" aria-hidden="true">
          <div class="modal-dialog modal-lg" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="exampleModalLongTitle">Transaction History</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div class="modal-body">
                <h6>Account ID: {{txnHistoryAccount}}, Owner: {{ownerName}}</h6>
                <table class="table table-striped">
                  <thead>
                  <tr>
                    <th>Time</th>
                    <th>From Account# @ Bank</th>
                    <th>To Account# @ Bank</th>
                    <th>Amount</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr *ngFor="let txh of txnHistory">
                    <td>{{txh.timestamp}}</td>
                    <ng-template [ngIf]="txh.from_account_id == -1" [ngIfElse]="showFromAccount">
                      <td>Cash</td>
                    </ng-template>
                    <ng-template #showFromAccount>
                      <td>{{txh.from_account_id}} @ {{txh.from_location}}</td>
                    </ng-template>
                    <ng-template [ngIf]="txh.to_account_id == -1" [ngIfElse]="showToAccount">
                      <td>Cash</td>
                    </ng-template>
                    <ng-template #showToAccount>
                      <td>{{txh.to_account_id}} @ {{txh.to_location}}</td>
                    </ng-template>
                    <ng-template [ngIf]="txh.to_account_id == txnHistoryAccount && txh.to_location == 'local'" [ngIfElse]="showNegative">
                      <td><strong class="text-success">+\${{(txh.amount / 100.0).toFixed(2)}}</strong></td>
                    </ng-template>
                    <ng-template #showNegative>
                      <td><strong class="text-danger">-\${{(txh.amount / 100.0).toFixed(2)}}</strong></td>
                    </ng-template>
                  </tr>
                  </tbody>
                </table>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="container">
        <div class="modal fade" id="deposit" tabindex="-1" role="dialog" aria-hidden="true">
          <div class="modal-dialog modal-lg" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="depositTitle">Make a Deposit</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <form (ngSubmit)="deposit(txnHistoryAccount)">
                <div class="modal-body">
                  <h6>Account ID: {{txnHistoryAccount}}, Owner: {{ownerName}}</h6>
                  <label class="text-uppercase text-muted secondary-text mb-1" for="depositSource">Source</label>
                  <div class="input-group mb-3">
                    <div class="input-group-prepend mr-2">
                      <span class="input-group-text">From</span>
                    </div>
                    <select class="form-control" id="depositSource" [(ngModel)]="selectedTransferSource" name="selectedDepositSource" required>
                      <ng-container *ngFor="let host of this._service.bankHosts; index as i">
                        <option *ngIf="i+1 != bankId" value="{{host}}">Branch-{{i+1}}: {{host}}</option>
                      </ng-container>
                      <div class="dropdown-divider"></div>
                      <option value="cash">Cash</option>
                    </select>
                    <ng-template [ngIf]="selectedTransferSource != 'cash'">
                      <div class="input-group-prepend mr-2">
                        <span class="input-group-text">External Account ID: </span>
                      </div>
                      <input class="form-control" type="number" step="1" id="externalDepositAcctId" placeholder="1" min="1" max="5000000" [(ngModel)]="externalAccountId" name="externalDepositAcctId" required>
                    </ng-template>
                    <div class="invalid-feedback">
                      Please enter a valid amount.
                    </div>
                  </div>

                  <label class="text-uppercase text-muted secondary-text mb-1" for="depositValue">Deposit Amount</label>
                  <div class="input-group mb-3">
                    <div class="input-group-prepend mr-2">
                      <span class="input-group-text"><span class="amount-font material-icons money-icon">$</span></span>
                    </div>
                    <input class="form-control" type="number" step="0.01" id="depositValue" placeholder="0.01" min="0.01" max="50000.00" [(ngModel)]="amount" name="depositValue" required>
                    <div class="invalid-feedback">
                      Please enter a valid amount.
                    </div>
                  </div>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                  <button type="submit" class="btn btn-primary" data-bs-dismiss="modal">Deposit</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <div class="container">
        <div class="modal fade" id="withdraw" tabindex="-1" role="dialog" aria-hidden="true">
          <div class="modal-dialog modal-lg" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="withdrawTitle">Withdraw Cash</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <form (ngSubmit)="withdraw(txnHistoryAccount)">
                <div class="modal-body">
                  <h6>Account ID: {{txnHistoryAccount}}, Owner: {{ownerName}}</h6>
                  <label class="text-uppercase text-muted secondary-text mb-1" for="withdrawDst">Destination</label>
                  <div class="input-group mb-3">
                    <div class="input-group-prepend mr-2">
                      <span class="input-group-text">To</span>
                    </div>
                    <select class="form-control" id="withdrawDst" [(ngModel)]="selectedTransferSource" name="selectedWithdrawDst" required>
                      <ng-container *ngFor="let host of this._service.bankHosts; index as i">
                        <option *ngIf="i+1 != bankId" value="{{host}}">Branch-{{i+1}}: {{host}}</option>
                      </ng-container>
                      <div class="dropdown-divider"></div>
                      <option value="cash">Cash</option>
                    </select>
                    <ng-template [ngIf]="selectedTransferSource != 'cash'">
                      <div class="input-group-prepend mr-2">
                        <span class="input-group-text">External Account ID: </span>
                      </div>
                      <input class="form-control" type="number" step="1" id="externalWithdrawAcctId" placeholder="1" min="1" max="5000000" [(ngModel)]="externalAccountId" name="externalWithdrawAcctId" required>
                    </ng-template>
                    <div class="invalid-feedback">
                      Please enter a valid amount.
                    </div>
                  </div>

                  <label class="text-uppercase text-muted secondary-text mb-1" for="withdrawValue">Withdrawal Amount</label>
                  <div class="input-group mb-3">
                    <div class="input-group-prepend mr-2">
                      <span class="input-group-text"><span class="amount-font material-icons money-icon">$</span></span>
                    </div>
                    <input class="form-control" type="number" step="0.01" id="withdrawValue" placeholder="0.01" min="0.01" max="50000.00" [(ngModel)]="amount" name="withdrawValue" required>
                    <div class="invalid-feedback">
                      Please enter a valid amount.
                    </div>
                  </div>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                  <button type="submit" class="btn btn-primary" data-bs-dismiss="modal">Withdraw</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <div class="container">
        <div class="modal fade" id="internalTransfer" tabindex="-1" role="dialog" aria-hidden="true">
          <div class="modal-dialog modal-lg" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="depositTitle">Transfer to Your Other Accounts</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <form (ngSubmit)="transfer(txnHistoryAccount, selectedTransferAccount)">
                <div class="modal-body">
                  <h6>Account ID: {{txnHistoryAccount}}, Owner: {{ownerName}}</h6>
                  <label for="transferDst">Transfer to Account:</label>
                  <select class="form-control" id="transferDst" [(ngModel)]="selectedTransferAccount" name="selectedTransferAccount" required>
                    <ng-container *ngFor="let acct of accounts">
                      <option *ngIf="acct.account_id != txnHistoryAccount" value="{{acct.account_id}}">{{acct.account_id}}</option>
                    </ng-container>
                  </select>
                  <label class="text-uppercase text-muted secondary-text mb-1" for="transferValue">Transfer Amount</label>
                  <div class="input-group mb-3">
                    <div class="input-group-prepend mr-2">
                      <span class="input-group-text"><span class="amount-font material-icons money-icon">$</span></span>
                    </div>
                    <input class="form-control" type="number" step="0.01" id="transferValue" placeholder="0.01" min="0.01" max="50000.00" [(ngModel)]="amount" name="transferValue" required>
                    <div class="invalid-feedback">
                      Please enter a valid amount.
                    </div>
                  </div>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                  <button type="submit" class="btn btn-primary" data-bs-dismiss="modal">Transfer</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
  </div>`
})

export class BankComponent {
  bankmsg = 'empty';
  accounts: BankAccountInfo[] = [];
  ownerName = 'empty';
  userRole = 'empty';
  txnHistory: TransactionHistory[] = [];
  txnHistoryAccount: number = -1;

      @Input()
        bankUrl: string | undefined;

      @Input()
        bankId: number | undefined;

      amount: number = 0.0;
      selectedTransferAccount: number = -1;
      selectedTransferSource: string = "cash";
      externalAccountId: number = -1;

      constructor(public _service:AppService) {
      }

      ngOnInit() {
        this.getMsg();
        this.ownerName = this._service.getPayloads().preferred_username;
        this.userRole = this._service.getPayloads().realm_access.roles[0];
        this.txnHistory = [];
        this.txnHistoryAccount = -1;
        this.accounts = [];
        this.getAccounts();
      }

      ngOnChanges(changes: SimpleChanges) {
        // changes.prop contains the old and the new value...
        console.log(changes);
        this.ngOnInit();
      }

      getMsg(){
        let url = '/api/greeting';
        this._service.getResource(this.bankUrl + url)
          .subscribe(
            {
              next: (data: any) => this.bankmsg = data.toString(),
              error: (err: any) => { this.bankmsg = 'Error' }
            });
      }

      createNewAccount(): void {
        const newAcct = {
          ownerName: this.ownerName,
          type: 'checking',
          balance: 0.0,
          uuid: 'angulartest123'
        }
        this._service.postResource(this.bankUrl + "/api/create_account",
          JSON.stringify(newAcct))
          .subscribe({
            next: (data: any) => {this.bankmsg = 'Successfully created an account! Account ID: ' + data;
            this.getAccounts();},
            error: (err: any) => { this.bankmsg = 'Failed to create a new account' }
          });
      }

      // List all accounts list_accounts
      getAccounts(){
        this._service.getResource(this.bankUrl + "/api/list_accounts/" + this.ownerName)
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
}
