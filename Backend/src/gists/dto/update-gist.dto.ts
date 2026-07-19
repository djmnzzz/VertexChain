import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateGistDto {
  @ApiProperty({
    description: 'Corrected gist content (max 280 characters)',
    example: 'Great coffee spot here! (typo fixed)',
    maxLength: 280,
  })
  @IsString()
  @MaxLength(280)
  content: string;

  @ApiProperty({
    description: "Stellar address of the gist's original author; must match the stored author",
    example: 'GABC...XYZ',
  })
  @IsString()
  @MaxLength(80)
  author: string;
}
