export function onSelectValue(setter: (value: string) => void) {
  return (value: string | null) => {
    if (value !== null) {
      setter(value)
    }
  }
}
