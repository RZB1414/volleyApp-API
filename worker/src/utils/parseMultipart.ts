export type UploadedFile = {
  file: File;
  filename: string;
  contentType: string | null;
  size: number;
};

export async function readFileFromForm(request: Request, fieldName: string): Promise<UploadedFile | null> {
  const formData = await request.formData();
  const value = formData.get(fieldName);

  if (!(value instanceof File)) {
    return null;
  }

  return {
    file: value,
    filename: value.name,
    contentType: value.type || null,
    size: value.size
  };
}
