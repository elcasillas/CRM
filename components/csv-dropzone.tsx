'use client'

import { useRef, useState } from 'react'

export type DropzoneUploadState = 'idle' | 'uploading' | 'success' | 'error'

interface CsvDropzoneProps {
  /** Called with the file when a valid .csv is selected or dropped */
  onFile: (file: File) => void
  /** Visual state driven by the parent after upload starts */
  uploadState?: DropzoneUploadState
  /** Message shown inside the dropzone in success or error states */
  statusMessage?: string
  /** Helper text below the main drop prompt */
  instructions?: React.ReactNode
  /** Filename to display when a file has already been selected */
  fileName?: string
  /** Called when the user wants to reset (try again after success/error) */
  onReset?: () => void
}

export function CsvDropzone({
  onFile,
  uploadState = 'idle',
  statusMessage,
  instructions,
  fileName,
  onReset,
}: CsvDropzoneProps) {
  const inputRef    = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [typeError, setTypeError] = useState<string | null>(null)

  const isUploading = uploadState === 'uploading'
  const isSuccess   = uploadState === 'success'
  const isExtError  = uploadState === 'error'
  const isError     = isExtError || !!typeError

  function validateAndProcess(file: File) {
    const name  = file.name.toLowerCase()
    const valid = name.endsWith('.csv') || file.type === 'text/csv' || file.type.includes('csv')
    if (!valid) {
      setTypeError(`"${file.name}" is not a CSV file. Please select a .csv file.`)
      return
    }
    setTypeError(null)
    onFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (isUploading) return
    const file = e.dataTransfer.files[0]
    if (file) validateAndProcess(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) validateAndProcess(file)
    e.target.value = ''
  }

  function openBrowser() { inputRef.current?.click() }

  function handleZoneClick() {
    if (isUploading || isSuccess) return
    setTypeError(null)
    if (isExtError) onReset?.()
    openBrowser()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleZoneClick() }
  }

  let zoneClass = 'border-2 border-dashed rounded-xl p-10 text-center transition-colors '
  if      (isUploading)          zoneClass += 'border-gray-200 bg-gray-50 cursor-wait'
  else if (isSuccess)            zoneClass += 'border-green-300 bg-green-50'
  else if (isError)              zoneClass += 'border-red-300 bg-red-50 cursor-pointer'
  else if (dragOver)             zoneClass += 'border-[#00ADB1] bg-[#E6F7F8] cursor-pointer'
  else                           zoneClass += 'border-gray-300 hover:border-gray-400 bg-white cursor-pointer'

  return (
    <div
      role="button"
      tabIndex={isUploading ? -1 : 0}
      aria-label="CSV upload area. Click or drag and drop a .csv file to import."
      onDragOver={e => { e.preventDefault(); if (!isUploading) setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={handleZoneClick}
      onKeyDown={handleKeyDown}
      className={zoneClass}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {isUploading && (
        <p className="text-gray-500 text-sm font-medium">Importing…</p>
      )}

      {isSuccess && (
        <div>
          <p className="text-green-800 text-sm font-medium">{statusMessage}</p>
          {onReset && (
            <button
              onClick={e => { e.stopPropagation(); onReset() }}
              className="mt-2 text-xs text-green-600 hover:text-green-800 underline focus:outline-none focus:ring-1 focus:ring-green-400 rounded"
            >
              Import another file
            </button>
          )}
        </div>
      )}

      {isError && !isUploading && (
        <div>
          <p className="text-red-700 text-sm font-medium">{typeError ?? statusMessage}</p>
          <button
            onClick={e => {
              e.stopPropagation()
              setTypeError(null)
              if (isExtError) { onReset?.() } else { openBrowser() }
            }}
            className="mt-2 text-xs text-red-600 hover:text-red-800 underline focus:outline-none focus:ring-1 focus:ring-red-400 rounded"
          >
            Try again
          </button>
        </div>
      )}

      {!isUploading && !isSuccess && !isError && (
        <div>
          <p className="text-gray-500 text-sm">
            {fileName
              ? <span className="font-medium text-gray-800">{fileName}</span>
              : 'Drop a CSV file here or click to browse'
            }
          </p>
          {instructions && <p className="text-xs text-gray-400 mt-1">{instructions}</p>}
        </div>
      )}
    </div>
  )
}
