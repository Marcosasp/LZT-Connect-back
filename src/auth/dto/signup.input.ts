import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsString,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class SignupInput {
  @ApiProperty()
  @IsEmail({}, { message: 'E-mail inválido' })
  @IsNotEmpty({ message: 'O e-mail não pode estar vazio' })
  email: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'A senha não pode estar vazia' })
  @MinLength(7, { message: 'A senha deve ter no mínimo 7 caracteres' })
  password: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  @IsString({ message: 'O nome deve ser uma texto' })
  firstname: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'O sobrenome é obrigatório' })
  @IsString({ message: 'O sobrenome deve ser uma texto' })
  lastname: string;

  @ApiProperty({
    example: '20/01/1990',
    description: 'Data no formato DD/MM/YYYY',
  })
  @IsNotEmpty({ message: 'A data de nascimento é obrigatória' })
  @Matches(/^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/, {
    message: 'A data de nascimento deve estar no formato DD/MM/YYYY',
  })
  birthday: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'O telefone é obrigatório' })
  phone: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'A rua é obrigatória' })
  street: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'A cidade é obrigatória' })
  city: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'O estado é obrigatório' })
  state: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'O CEP é obrigatório' })
  zip_code: string;
}
