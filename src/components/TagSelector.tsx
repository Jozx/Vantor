import { useState } from 'react';
import { getTags, createTag } from '@/services/financeService';
import { randomTagColor } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Tag } from '@/db';

interface TagSelectorProps {
  tags: Tag[];
  value: number | null;
  onChange: (tagId: number | null) => void;
  onTagsRefreshed?: (tags: Tag[]) => void;
  required?: boolean;
  className?: string;
  label?: string;
  noTagLabel?: string;
}

export default function TagSelector({
  tags,
  value,
  onChange,
  onTagsRefreshed,
  required = false,
  className = '',
  label = 'Tag',
  noTagLabel = 'No tag',
}: TagSelectorProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customTagName, setCustomTagName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleChange = async (raw: string) => {
    if (raw === '__custom__') {
      setCustomMode(true);
      setCustomTagName('');
      onChange(-1);
      return;
    }

    setCustomMode(false);
    setError('');
    onChange(raw ? Number(raw) : null);
  };

  const handleCustomSubmit = async (): Promise<number | null> => {
    if (!customTagName.trim()) {
      setError('Please enter a tag name');
      return null;
    }

    setCreating(true);
    try {
      const newId = await createTag({ name: customTagName.trim(), color: randomTagColor() });
      const updated = await getTags();
      onTagsRefreshed?.(updated);
      setCustomMode(false);
      setCustomTagName('');
      setError('');
      return newId;
    } catch {
      setError('Failed to create tag');
      return null;
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <Select
        value={value === null ? undefined : value === -1 ? '__custom__' : String(value)}
        onValueChange={(val: string) => handleChange(val)}
      >
        <SelectTrigger className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50">
          <SelectValue placeholder={noTagLabel} />
        </SelectTrigger>
        <SelectContent>
          {tags.map((tag) => (
            <SelectItem key={tag.id} value={String(tag.id)}>
              {tag.name}
            </SelectItem>
          ))}
          <SelectItem value="__custom__">Other (custom)...</SelectItem>
        </SelectContent>
      </Select>
      {customMode && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            placeholder="Enter tag name..."
            value={customTagName}
            onChange={(e) => { setCustomTagName(e.target.value); setError(''); }}
            className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1.5 text-sm outline-hidden focus:border-zinc-900 dark:focus:border-zinc-50 focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-50"
          />
          <button
            type="button"
            disabled={creating}
            onClick={async () => {
              const newId = await handleCustomSubmit();
              if (newId !== null) onChange(newId);
            }}
            className="px-3 py-1.5 text-xs font-semibold bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 rounded-lg cursor-pointer disabled:opacity-50"
          >
            {creating ? '...' : 'Add'}
          </button>
        </div>
      )}
      {error && (
        <p className="text-xs text-rose-500 mt-1">{error}</p>
      )}
    </div>
  );
}
