import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OwnerNameDialogComponent } from './owner-name-dialog.component';

describe('OwnerNameDialogComponent', () => {
  let component: OwnerNameDialogComponent;
  let fixture: ComponentFixture<OwnerNameDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OwnerNameDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(OwnerNameDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
