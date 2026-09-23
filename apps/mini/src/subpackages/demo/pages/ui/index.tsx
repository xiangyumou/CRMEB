import { useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import { Placeholder, placeholderStyles } from '@/shell/placeholder';
import { Popup } from '@/ui/popup';
import { TextField } from '@/ui/text-field';
import { ToastHost, toast } from '@/ui/toast';

/** Sub-package page proving the UI kit: a popup, a toast and a form control. */
export default function UiDemo() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  return (
    <Placeholder title="组件示例">
      <TextField value={name} onChange={setName} placeholder="输入昵称" maxLength={20} />
      <Button className={placeholderStyles.button} onClick={() => setOpen(true)}>
        打开弹层
      </Button>
      <Button
        className={placeholderStyles.button}
        onClick={() => toast(name ? `你好，${name}` : '请先输入昵称', name ? 'success' : 'warn')}
      >
        提示
      </Button>
      <Popup visible={open} title="弹层" onClose={() => setOpen(false)}>
        <View style={{ padding: '24px' }}>
          <Text>{name || '未填写昵称'}</Text>
        </View>
      </Popup>
      <ToastHost />
    </Placeholder>
  );
}
