import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../users/entities/user.entity';
import { Token } from './token.entity';

export class Auth extends Token {
  @ApiProperty({ type: () => User })
  user: User;
}
