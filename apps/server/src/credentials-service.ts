import type { PortalCredentials } from '@asa/convenios';

export class CredentialsService {
  public getForConvenio(convenioCode: string): PortalCredentials {
    const username = process.env[`PORTAL_${convenioCode}_USERNAME`];
    const password = process.env[`PORTAL_${convenioCode}_PASSWORD`];

    return {
      username: username ?? '',
      password: password ?? '',
    };
  }
}
