import { Button, Result } from 'antd';
import Link from 'next/link';

export default function ShellNotFound() {
  return (
    <Result
      status="404"
      title="404"
      subTitle="抱歉，你访问的页面不存在。"
      extra={
        <Link href="/admin">
          <Button type="primary">返回首页</Button>
        </Link>
      }
    />
  );
}
