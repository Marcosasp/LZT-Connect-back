import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BasicAuthSecurity, createClientAsync, WSSecurity } from 'soap';

type ImportArquivoArgs = {
  aPin: string;
  aArquivo: string;
  aLivre: string;
};

@Injectable()
export class WintourSoapService {
  private readonly logger = new Logger(WintourSoapService.name);

  private getWsdlUrl() {
    const configuredUrl = process.env.WINTOUR_SOAP_URL;

    if (!configuredUrl) {
      throw new ServiceUnavailableException(
        'Integracao Wintour nao configurada. Defina WINTOUR_SOAP_URL.',
      );
    }

    const normalizedUrl = configuredUrl.trim();

    if (
      normalizedUrl.toLowerCase().includes('?wsdl') ||
      normalizedUrl.toLowerCase().endsWith('.wsdl')
    ) {
      return normalizedUrl;
    }

    const separator = normalizedUrl.includes('?') ? '&' : '?';
    return `${normalizedUrl}${separator}wsdl`;
  }

  private getEndpointUrl() {
    return process.env.WINTOUR_SOAP_URL;
  }

  private getSoapAction() {
    return (
      process.env.WINTOUR_SOAP_ACTION ?? 'http://tempuri.org/importaArquivo2'
    );
  }

  private applySecurity(client: any, pin: string) {
    const securityMode = (
      process.env.WINTOUR_SOAP_SECURITY ?? 'wsse'
    ).toLowerCase();
    const password = process.env.WINTOUR_SOAP_PASSWORD ?? '';

    if (securityMode === 'basic') {
      client.setSecurity(new BasicAuthSecurity(pin, password));
      return;
    }

    client.setSecurity(new WSSecurity(pin, password));
  }

  private resolveImportMethod(client: any) {
    const methodCandidates = [
      'importaArquivo2Async',
      'importarArquivo2Async',
      'importaArquivo2',
      'importarArquivo2',
    ];

    const methodName = methodCandidates.find(
      (candidate) => typeof client[candidate] === 'function',
    );

    if (!methodName) {
      this.logger.error(
        'Metodo importaArquivo2/importarArquivo2 nao encontrado no cliente WSDL do Wintour.',
      );
      throw new ServiceUnavailableException(
        'Metodo de importacao Wintour nao encontrado no WSDL configurado.',
      );
    }

    return methodName;
  }

  async importarArquivo2(args: ImportArquivoArgs) {
    const wsdlUrl = this.getWsdlUrl();
    const endpoint = this.getEndpointUrl();
    const soapAction = this.getSoapAction();

    const client = await createClientAsync(wsdlUrl, {
      endpoint,
      wsdl_headers: {
        Accept: 'text/xml',
      },
      disableCache: true,
    });

    this.applySecurity(client, args.aPin);
    client.addHttpHeader('SOAPAction', soapAction);

    const methodName = this.resolveImportMethod(client);
    const response = await client[methodName](args);

    const rawResponse =
      client.lastResponse ??
      (Array.isArray(response)
        ? JSON.stringify(response[0])
        : JSON.stringify(response));

    const body = Array.isArray(response) ? response[0] : response;

    const resultValue =
      body?.importaArquivo2Result ??
      body?.importarArquivo2Result ??
      body?.return ??
      '';

    return {
      rawResponse: String(rawResponse ?? ''),
      resultValue: String(resultValue ?? ''),
    };
  }
}
