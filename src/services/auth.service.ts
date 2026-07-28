import { BaseService } from './gateway'
import type { AuthServiceContract } from '../../electron/common/ipc-contract'

export class AuthService extends BaseService implements AuthServiceContract {
  protected serviceName = 'auth' as const

  async setUsername(username: string | null): Promise<void> {
    return this.call('setUsername', username)
  }

  async getUsername(): Promise<string | null> {
    return this.call('getUsername')
  }

  async isAuthenticated(): Promise<boolean> {
    return this.call('isAuthenticated')
  }

  async loginSuccess(): Promise<void> {
    return this.call('loginSuccess')
  }

  async logout(): Promise<void> {
    return this.call('logout')
  }
}

export const authService = new AuthService()
