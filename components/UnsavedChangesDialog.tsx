'use client'

interface Props {
  onSave: () => void | Promise<void>
  onDiscard: () => void
  onCancel: () => void
  saving?: boolean
}

export function UnsavedChangesDialog({ onSave, onDiscard, onCancel, saving = false }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-4 bg-[#00ADB1] rounded-t-xl">
          <h3 className="font-semibold text-white">Unsaved Changes</h3>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-gray-700 leading-relaxed">
            You have unsaved changes. Leaving now will discard them.
          </p>
        </div>
        <div className="px-6 pb-5 flex flex-wrap justify-end gap-3">
          <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 rounded-lg transition-colors">
            Stay on Page
          </button>
          <button onClick={onDiscard} className="text-sm font-medium text-red-600 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg transition-colors hover:bg-red-50">
            Discard Changes
          </button>
          <button onClick={onSave} disabled={saving} className="text-sm font-medium text-white bg-[#00ADB1] hover:bg-[#00989C] disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
