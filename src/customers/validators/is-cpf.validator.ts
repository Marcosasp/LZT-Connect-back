import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

function isValidCpf(value: string): boolean {
  if (!value) {
    return false;
  }

  const cpf = value.replace(/\D/g, '');

  if (cpf.length !== 11) {
    return false;
  }

  if (/^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const digits = cpf.split('').map((digit) => Number(digit));

  let firstVerifier = 0;
  for (let i = 0; i < 9; i += 1) {
    firstVerifier += digits[i] * (10 - i);
  }
  firstVerifier = (firstVerifier * 10) % 11;
  firstVerifier = firstVerifier === 10 ? 0 : firstVerifier;

  if (firstVerifier !== digits[9]) {
    return false;
  }

  let secondVerifier = 0;
  for (let i = 0; i < 10; i += 1) {
    secondVerifier += digits[i] * (11 - i);
  }
  secondVerifier = (secondVerifier * 10) % 11;
  secondVerifier = secondVerifier === 10 ? 0 : secondVerifier;

  return secondVerifier === digits[10];
}

export function IsCpf(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCpf',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') {
            return false;
          }

          return isValidCpf(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} inválido`;
        },
      },
    });
  };
}
