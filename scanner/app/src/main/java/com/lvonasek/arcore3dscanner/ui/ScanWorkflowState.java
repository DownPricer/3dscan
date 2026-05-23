package com.lvonasek.arcore3dscanner.ui;

public enum ScanWorkflowState {
  IDLE,
  SCANNING,
  SCAN_FINISHED,
  PROCESSING_GEOMETRY,
  ANALYZING_IMAGES,
  GENERATING_TEXTURES,
  VALIDATING_EXPORT,
  SAVING_PC_DATASET,
  CREATING_PC_ZIP,
  READY,
  READY_PC_DATASET,
  ERROR;

  public static ScanWorkflowState fromId(String value) {
    if (value != null) {
      for (ScanWorkflowState state : values()) {
        if (state.name().equals(value)) {
          return state;
        }
      }
    }
    return IDLE;
  }
}
