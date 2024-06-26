import { User } from '../entities/user.entity';
import { OmitType, PartialType } from '@nestjs/mapped-types';

export class DeleteUserDto extends OmitType(PartialType(User), [
  'Device',
] as const) {}
