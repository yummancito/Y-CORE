import { describe, expect, it } from 'vitest'
import { parseRatingValue } from '../../src/jobs/updateRatings.processor.js'

describe('parseRatingValue', () => {
  it('parsea IMDb en formato "8.7/10" a escala 10', () => {
    expect(parseRatingValue('Internet Movie Database', '8.7/10')).toEqual({
      source: 'imdb',
      value: 8.7,
      scale: 10,
    })
  })

  it('parsea Rotten Tomatoes en formato "87%" a escala 100', () => {
    expect(parseRatingValue('Rotten Tomatoes', '87%')).toEqual({
      source: 'rotten_tomatoes',
      value: 87,
      scale: 100,
    })
  })

  it('parsea Metacritic en formato "88/100" a escala 100', () => {
    expect(parseRatingValue('Metacritic', '88/100')).toEqual({
      source: 'metacritic',
      value: 88,
      scale: 100,
    })
  })

  it('devuelve null para una fuente desconocida', () => {
    expect(parseRatingValue('Some Other Source', '5/5')).toBeNull()
  })

  it('devuelve null si el valor no es parseable como número', () => {
    expect(parseRatingValue('Internet Movie Database', 'N/A')).toBeNull()
  })
})
