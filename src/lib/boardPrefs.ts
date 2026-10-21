import { createContext, useContext } from 'react'
import { DEFAULT_SETTINGS, type Settings } from './settings'

/** The settings every board and move list follows, wherever it is, without each page passing them on. */
export type BoardPrefs = Pick<Settings, 'highlightLastMove' | 'showLegalMoves' | 'animation' | 'notation' | 'moveEffects' | 'soundVolume'>

export const BoardPrefsContext = createContext<BoardPrefs>(DEFAULT_SETTINGS)

export const useBoardPrefs = () => useContext(BoardPrefsContext)
