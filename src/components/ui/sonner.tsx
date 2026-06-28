import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentPropsWithoutRef<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return <Sonner theme="dark" className="toaster group" {...props} />
}

export { Toaster }