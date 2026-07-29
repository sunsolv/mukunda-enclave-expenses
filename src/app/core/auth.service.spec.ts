import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';

describe('AuthService login identifiers', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('logs Flat 101 in by bare flat number with the corrected owner profile', async () => {
    const auth = TestBed.inject(AuthService);
    await auth.login('101', 'demo-password');

    expect(auth.profile()).toMatchObject({
      username: 'flat101',
      flatNumber: '101',
      ownerName: 'K V Reddy Prasad',
    });
  });

  it('continues to accept an assigned username', async () => {
    const auth = TestBed.inject(AuthService);
    await auth.login('flat102', 'demo-password');

    expect(auth.profile()).toMatchObject({
      username: 'flat102',
      flatNumber: '102',
    });
  });
});
