import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-owner-name-dialog',
  templateUrl: './owner-name-dialog.component.html',
  styleUrl: './owner-name-dialog.component.css'
})
export class OwnerNameDialogComponent {
  ownerName: string = '';

  constructor(public dialogRef: MatDialogRef<OwnerNameDialogComponent>) {}

  onNoClick(): void {
    this.dialogRef.close();
  }

  onConfirmClick(): void {
    this.dialogRef.close(this.ownerName);
  }
}
