import { useState, useRef, useCallback, useEffect } from 'react'

const PLAY_INTERVAL_MS = 1200

export function useTimeAnimation() {
  const [hour, setHour] = useState(8)
  const [isPlaying, setIsPlaying] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPlay = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsPlaying(false)
  }, [])

  const startPlay = useCallback(() => {
    stopPlay()
    setIsPlaying(true)
    timerRef.current = setInterval(() => {
      setHour((prev) => (prev + 1) % 24)
    }, PLAY_INTERVAL_MS)
  }, [stopPlay])

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      stopPlay()
    } else {
      startPlay()
    }
  }, [isPlaying, startPlay, stopPlay])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  return { hour, isPlaying, togglePlay, setHour, stopPlay }
}
