import type { YandexClient } from '@boxlab/yandex-mcp-core'
import {
    AnnotationResponseSchema,
    AnnotationsResponseSchema,
    type Annotation,
} from './schemas.js'

export interface AnnotationInput {
    date: string
    time?: string
    title: string
    message?: string
    group?: string
}

export async function listAnnotations(
    client: YandexClient,
    counterId: number,
): Promise<Annotation[]> {
    const raw = await client.request(
        `/management/v1/counter/${counterId}/chart_annotations`,
        {},
    )
    return AnnotationsResponseSchema.parse(raw).chart_annotations
}

export async function getAnnotation(
    client: YandexClient,
    counterId: number,
    id: number,
): Promise<Annotation> {
    const raw = await client.request(
        `/management/v1/counter/${counterId}/chart_annotation/${id}`,
        {},
    )
    return AnnotationResponseSchema.parse(raw).chart_annotation
}

export async function createAnnotation(
    client: YandexClient,
    counterId: number,
    input: AnnotationInput,
): Promise<Annotation> {
    const raw = await client.requestJson(
        `/management/v1/counter/${counterId}/chart_annotations`,
        { method: 'POST', json: { chart_annotation: input } },
    )
    return AnnotationResponseSchema.parse(raw).chart_annotation
}

export async function updateAnnotation(
    client: YandexClient,
    counterId: number,
    id: number,
    input: AnnotationInput,
): Promise<Annotation> {
    const raw = await client.requestJson(
        `/management/v1/counter/${counterId}/chart_annotation/${id}`,
        { method: 'PUT', json: { chart_annotation: input } },
    )
    return AnnotationResponseSchema.parse(raw).chart_annotation
}

export async function deleteAnnotation(
    client: YandexClient,
    counterId: number,
    id: number,
): Promise<void> {
    await client.requestJson(
        `/management/v1/counter/${counterId}/chart_annotation/${id}`,
        { method: 'DELETE' },
    )
}
