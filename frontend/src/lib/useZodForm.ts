import { DefaultValues, FieldValues, useForm, UseFormProps, UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ZodSchema } from "zod";

/**
 * Convenience wrapper around react-hook-form that:
 *  - Plugs a zod schema into the resolver so client validation mirrors the
 *    server zod schemas exactly.
 *  - Validates on submit first and re-validates on blur after that — the
 *    modern consensus: no per-keystroke noise, but quick feedback once the
 *    user knows a field was wrong.
 *  - Does NOT disable the submit button automatically — callers decide.
 */
export function useZodForm<T extends FieldValues>(
  schema: ZodSchema<T>,
  options: Omit<UseFormProps<T>, "resolver"> & { defaultValues: DefaultValues<T> },
): UseFormReturn<T> {
  // zodResolver's generics through react-hook-form's overloads are brittle
  // across library versions — they all converge at runtime, so we cast at the
  // resolver boundary rather than polluting every form file.
  return useForm<T>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any) as UseFormProps<T>["resolver"],
    mode: "onSubmit",
    reValidateMode: "onBlur",
    shouldFocusError: true,
    ...options,
  });
}
