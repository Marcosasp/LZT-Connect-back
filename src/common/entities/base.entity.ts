import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export abstract class BaseEntity {
  @ApiProperty()
  id: string;

  @ApiProperty({
    description: 'Identifies the date and time when the object was created.',
  })
  @Transform(({ value }) => {
    if (!(value instanceof Date)) return value;
    const pad = (n: number, m = 2) => n.toString().padStart(m, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
      value.getDate(),
    )} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(
      value.getSeconds(),
    )}.${pad(value.getMilliseconds(), 3)}`;
  })
  created_at: Date;

  @ApiProperty({
    description:
      'Identifies the date and time when the object was last updated.',
  })
  @Transform(({ value }) => {
    if (!(value instanceof Date)) return value;
    const pad = (n: number, m = 2) => n.toString().padStart(m, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
      value.getDate(),
    )} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(
      value.getSeconds(),
    )}.${pad(value.getMilliseconds(), 3)}`;
  })
  updated_at: Date;
}
