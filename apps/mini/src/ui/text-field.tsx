import NutInput from '@nutui/nutui-react-taro/dist/es/packages/input';
import '@nutui/nutui-react-taro/dist/es/packages/input/style/css';
import { defined } from '@/lib/defined';

export interface TextFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  maxLength?: number | undefined;
}

/** A single-line text input with a clear button. */
export function TextField({ value, onChange, placeholder, maxLength }: TextFieldProps) {
  return (
    <NutInput
      value={value}
      onChange={onChange}
      clearable
      {...defined({ placeholder, maxLength })}
    />
  );
}
