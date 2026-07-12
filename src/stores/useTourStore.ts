import { create } from 'zustand'

export interface TourStep {
  id: string
  target: string
  titleKey: string
  descriptionKey: string
  placement: 'right' | 'left' | 'bottom' | 'top'
}

interface TourStore {
  isOpen: boolean
  currentStep: number
  steps: TourStep[]
  start: (steps: TourStep[]) => void
  next: () => void
  prev: () => void
  close: () => void
  goTo: (index: number) => void
}

export const useTourStore = create<TourStore>((set, get) => ({
  isOpen: false,
  currentStep: 0,
  steps: [],
  start: (steps) => set({ isOpen: true, currentStep: 0, steps }),
  next: () => {
    const { currentStep, steps } = get()
    if (currentStep < steps.length - 1) {
      set({ currentStep: currentStep + 1 })
    } else {
      set({ isOpen: false, steps: [] })
    }
  },
  prev: () => {
    const { currentStep } = get()
    if (currentStep > 0) {
      set({ currentStep: currentStep - 1 })
    }
  },
  close: () => set({ isOpen: false, steps: [], currentStep: 0 }),
  goTo: (index) => set({ currentStep: index }),
}))
