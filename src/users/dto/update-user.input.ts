import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsEmail,
  IsString,
  IsEnum,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Role } from '@prisma/client';

export class UpdateUserInput {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString({ message: 'O nome deve ser uma texto' })
  firstname?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString({ message: 'O sobrenome deve ser uma texto' })
  lastname?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false, example: '20/01/1990' })
  @IsOptional()
  @Matches(/^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/, {
    message: 'A data de nascimento deve estar no formato DD/MM/YYYY',
  })
  birthday?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  street?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  city?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  state?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  zip_code?: string;

  @ApiProperty({ required: false, enum: Role })
  @IsOptional()
  @IsEnum(Role, { message: 'O cargo deve ser um valor válido (ADMIN ou USER)' })
  role?: Role;
}
