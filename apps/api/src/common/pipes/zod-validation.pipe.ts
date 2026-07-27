import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { ZodSchema } from 'zod';

export const ZOD_SCHEMA = 'ZOD_SCHEMA';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    const schema = (metadata.metatype as { [ZOD_SCHEMA]?: ZodSchema } | undefined)?.[
      ZOD_SCHEMA
    ];
    if (!schema) return value;
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: parsed.error.issues,
      });
    }
    return parsed.data;
  }
}

/** Attach a zod schema to a DTO class for the global pipe. */
export function ZodBody<T extends ZodSchema>(schema: T) {
  return function <C extends new (...args: unknown[]) => unknown>(ctor: C) {
    Object.defineProperty(ctor, ZOD_SCHEMA, { value: schema });
    return ctor;
  };
}
