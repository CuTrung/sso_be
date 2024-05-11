import { IsNumber, IsString } from 'class-validator';

export class Webpage {
  @IsNumber()
  webpage_id: number;
  @IsString()
  webpage_name: string;
  @IsString()
  webpage_url: string;
  @IsString()
  webpage_key: string;
  @IsString()
  webpage_description: string;
}
