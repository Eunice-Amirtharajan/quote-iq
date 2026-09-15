import { ObjectType, Field, ID, Int, registerEnumType } from '@nestjs/graphql';
import { DocumentStatus, type Document } from '@prisma/client';

registerEnumType(DocumentStatus, { name: 'DocumentStatus' });

@ObjectType({ description: 'An uploaded document in the RAG knowledge base' })
export class DocumentType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  filename!: string;

  @Field(() => String)
  mimeType!: string;

  @Field(() => Int)
  sizeBytes!: number;

  @Field(() => String)
  storageUrl!: string;

  @Field(() => DocumentStatus)
  status!: DocumentStatus;

  @Field(() => String, { nullable: true })
  rejectedReason?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  uploadedById!: string;
  storageKey!: string;
}

type _FieldsMatch = DocumentType extends Pick<
  Document,
  | 'id'
  | 'filename'
  | 'mimeType'
  | 'sizeBytes'
  | 'storageUrl'
  | 'status'
  | 'rejectedReason'
  | 'createdAt'
  | 'uploadedById'
  | 'storageKey'
>
  ? true
  : never;
void (true as _FieldsMatch); // NOSONAR
