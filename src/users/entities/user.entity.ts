import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { BaseEntity } from '../../common/entities/base.entity';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';

export class User extends BaseEntity {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  firstname: string;

  @ApiProperty()
  lastname: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({
    example: '20/01/1990',
    description: 'Data no formato DD/MM/YYYY',
  })
  @Transform(({ value }) => {
    if (!(value instanceof Date)) return value;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(value.getDate())}/${pad(
      value.getMonth() + 1,
    )}/${value.getFullYear()}`;
  })
  birthday: Date;

  @ApiProperty()
  street: string;

  @ApiProperty()
  city: string;

  @ApiProperty()
  state: string;

  @ApiProperty()
  zip_code: string;

  @ApiProperty({ enum: Role })
  role: Role;

  password: string;
}
