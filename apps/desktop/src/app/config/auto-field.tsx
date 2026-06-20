import { Input } from '../../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Switch } from '../../components/ui/switch'
import { Textarea } from '../../components/ui/textarea'

// Schema-driven field renderer. Ported from web/src/components/AutoField.tsx,
// rewired to desktop UI primitives. One field maps to one input by schema.type:
// boolean → Switch, select → Select, number/text/list/string → Input/Textarea.

interface AutoFieldProps {
  schemaKey: string
  schema: Record<string, unknown>
  value: unknown
  onChange: (v: unknown) => void
}

// Radix Select forbids empty-string item values, so empty maps to a sentinel.
const NONE = '__none__'

function fieldLabel(schemaKey: string): string {
  const raw = schemaKey.split('.').pop() ?? schemaKey

  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function Hint({ schema, schemaKey }: { schema: Record<string, unknown>; schemaKey: string }) {
  const keyPath = schemaKey.includes('.') ? schemaKey : ''
  const description = schema.description ? String(schema.description) : ''

  if (!keyPath && !description) {return null}

  return (
    <div className="flex flex-col gap-0.5">
      {keyPath && <span className="font-mono text-xs text-(--ui-text-tertiary)">{keyPath}</span>}
      {description && <span className="text-xs text-(--ui-text-secondary)">{description}</span>}
    </div>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatScalar(value: unknown): string {
  if (value === undefined || value === null) {return ''}

  if (typeof value === 'string') {return value}

  if (typeof value === 'number' || typeof value === 'boolean') {return String(value)}

  return JSON.stringify(value)
}

function Lbl({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-(--ui-text-primary) ${className ?? ''}`}>{children}</span>
}

function NestedValueEditor({
  fieldKey,
  value,
  onChange,
}: {
  fieldKey: string
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (isRecord(value)) {
    return (
      <div className="grid gap-2 border border-(--stroke-nous) p-2">
        {Object.entries(value).map(([subKey, subVal]) => (
          <div className="grid gap-1" key={subKey}>
            <Lbl className="text-xs text-(--ui-text-secondary)">{subKey}</Lbl>
            <NestedValueEditor
              fieldKey={`${fieldKey}.${subKey}`}
              onChange={next => onChange({ ...value, [subKey]: next })}
              value={subVal}
            />
          </div>
        ))}
      </div>
    )
  }

  if (Array.isArray(value)) {
    return (
      <div className="grid gap-2">
        {value.map((item, index) => (
          <div className="grid gap-1" key={`${fieldKey}.${index}`}>
            <Lbl className="text-xs text-(--ui-text-secondary)">Item {index + 1}</Lbl>
            <NestedValueEditor
              fieldKey={`${fieldKey}.${index}`}
              onChange={next => onChange(value.map((existing, i) => (i === index ? next : existing)))}
              value={item}
            />
          </div>
        ))}
      </div>
    )
  }

  return <Input className="text-xs" onChange={e => onChange(e.target.value)} value={formatScalar(value)} />
}

export function AutoField({ schemaKey, schema, value, onChange }: AutoFieldProps) {
  const label = fieldLabel(schemaKey)

  if (isRecord(value) || (Array.isArray(value) && value.some(item => isRecord(item)))) {
    return (
      <div className="grid gap-3 border border-(--stroke-nous) p-3">
        <Lbl className="text-xs font-medium">{label}</Lbl>
        <Hint schema={schema} schemaKey={schemaKey} />
        <NestedValueEditor fieldKey={schemaKey} onChange={onChange} value={value} />
      </div>
    )
  }

  if (schema.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <Lbl className="text-sm">{label}</Lbl>
          <Hint schema={schema} schemaKey={schemaKey} />
        </div>
        <Switch checked={!!value} onCheckedChange={onChange} />
      </div>
    )
  }

  if (schema.type === 'select') {
    const options = (schema.options as string[]) ?? []

    return (
      <div className="grid gap-1.5">
        <Lbl className="text-sm">{label}</Lbl>
        <Hint schema={schema} schemaKey={schemaKey} />
        <Select onValueChange={v => onChange(v === NONE ? '' : v)} value={value ? String(value) : NONE}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(opt => (
              <SelectItem key={opt} value={opt || NONE}>
                {opt || '(none)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (schema.type === 'number') {
    return (
      <div className="grid gap-1.5">
        <Lbl className="text-sm">{label}</Lbl>
        <Hint schema={schema} schemaKey={schemaKey} />
        <Input
          onChange={e => {
            const raw = e.target.value

            if (raw === '') {
              onChange(0)

              return
            }

            const n = Number(raw)

            if (!Number.isNaN(n)) {onChange(n)}
          }}
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
        />
      </div>
    )
  }

  if (schema.type === 'text') {
    return (
      <div className="grid gap-1.5">
        <Lbl className="text-sm">{label}</Lbl>
        <Hint schema={schema} schemaKey={schemaKey} />
        <Textarea className="min-h-20" onChange={e => onChange(e.target.value)} value={String(value ?? '')} />
      </div>
    )
  }

  if (schema.type === 'list') {
    return (
      <div className="grid gap-1.5">
        <Lbl className="text-sm">{label}</Lbl>
        <Hint schema={schema} schemaKey={schemaKey} />
        <Input
          onChange={e =>
            onChange(
              e.target.value
                .split(',')
                .map(s => s.trim())
                .filter(Boolean),
            )
          }
          placeholder="comma-separated values"
          value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
        />
      </div>
    )
  }

  return (
    <div className="grid gap-1.5">
      <Lbl className="text-sm">{label}</Lbl>
      <Hint schema={schema} schemaKey={schemaKey} />
      <Input onChange={e => onChange(e.target.value)} value={String(value ?? '')} />
    </div>
  )
}
