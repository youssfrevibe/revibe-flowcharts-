import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface CanvasState {
  selectedIds: string[];
  hoverId: string | null;
  selectedConn: string | null;
  setSelected: (ids: string[]) => void;
  setHover: (id: string | null) => void;
  setSelectedConn: (id: string | null) => void;
}

export const useCanvasStore = create<CanvasState>()(
  immer(set => ({
    selectedIds: [],
    hoverId: null,
    selectedConn: null,
    setSelected: ids => {
      set(state => {
        state.selectedIds = ids;
      });
    },
    setHover: id => {
      set(state => {
        state.hoverId = id;
      });
    },
    setSelectedConn: id => {
      set(state => {
        state.selectedConn = id;
      });
    },
  }))
);
