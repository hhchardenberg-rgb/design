"use client";

import { useCallback, useReducer } from "react";
import type { TemplateSchemaJson } from "@/lib/validations/template";
import type { BuilderField } from "./template-builder";

export interface BuilderDoc {
  schema: TemplateSchemaJson;
  fields: BuilderField[];
}

type Updater<T> = T | ((prev: T) => T);

type Action =
  | { type: "schema"; next: Updater<TemplateSchemaJson>; batch: number }
  | { type: "fields"; next: Updater<BuilderField[]>; batch: number }
  | { type: "reset"; doc: BuilderDoc }
  | { type: "undo" }
  | { type: "redo" };

interface State {
  past: BuilderDoc[];
  present: BuilderDoc;
  future: BuilderDoc[];
  batch: number;
}

const LIMIT = 100;

function apply<T>(prev: T, next: Updater<T>): T {
  return typeof next === "function" ? (next as (p: T) => T)(prev) : next;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "schema":
    case "fields": {
      const present =
        action.type === "schema"
          ? { ...state.present, schema: apply(state.present.schema, action.next) }
          : { ...state.present, fields: apply(state.present.fields, action.next) };
      // Wijzigingen uit één handeling (bv. veld én laag) zijn één stap.
      const sameStep = action.batch === state.batch;
      return {
        past: sameStep ? state.past : [...state.past, state.present].slice(-LIMIT),
        present,
        future: [],
        batch: action.batch,
      };
    }
    case "reset":
      return { past: [], present: action.doc, future: [], batch: -1 };
    case "undo": {
      const prev = state.past.at(-1);
      if (!prev) return state;
      return { past: state.past.slice(0, -1), present: prev, future: [state.present, ...state.future], batch: -1 };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return { past: [...state.past, state.present], present: next, future: state.future.slice(1), batch: -1 };
    }
  }
}

// Alles wat in dezelfde taak gebeurt, hoort bij één handeling.
let batchCounter = 0;
let batchOpen = false;
function currentBatch() {
  if (!batchOpen) {
    batchOpen = true;
    batchCounter++;
    queueMicrotask(() => {
      batchOpen = false;
    });
  }
  return batchCounter;
}

/** Schema en velden van de builder met ongedaan maken / opnieuw. */
export function useBuilderHistory(initial: BuilderDoc) {
  const [state, dispatch] = useReducer(reducer, { past: [], present: initial, future: [], batch: -1 });
  const setSchema = useCallback((next: Updater<TemplateSchemaJson>) => dispatch({ type: "schema", next, batch: currentBatch() }), []);
  const setFields = useCallback((next: Updater<BuilderField[]>) => dispatch({ type: "fields", next, batch: currentBatch() }), []);
  const reset = useCallback((doc: BuilderDoc) => dispatch({ type: "reset", doc }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  return {
    schema: state.present.schema,
    fields: state.present.fields,
    setSchema,
    setFields,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
