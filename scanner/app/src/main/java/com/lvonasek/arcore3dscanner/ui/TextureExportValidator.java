package com.lvonasek.arcore3dscanner.ui;

import android.util.Log;

import com.lvonasek.arcore3dscanner.ui.AbstractActivity;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.util.LinkedHashSet;
import java.util.Set;

final class TextureExportValidator {

  static final class Result {
    boolean ok;
    String errorMessage;
    boolean hasUv;
    boolean hasMtllib;
    boolean hasUseMtl;
    boolean hasMapKd;
    int generatedTextureCount;
    File mtlFile;
  }

  private TextureExportValidator() {
  }

  static Result validate(File objFile, int availableFrames, int selectedFrames) {
    Result result = new Result();
    result.ok = false;

    if (availableFrames >= 0 && selectedFrames >= 0) {
      Log.i(AbstractActivity.TAG, "[TEXTURE] Image frames available: " + availableFrames);
      Log.i(AbstractActivity.TAG, "[TEXTURE] Selected frames for texturing: " + selectedFrames);
      if (availableFrames <= 0) {
        return fail(result, "No camera images available for texturing");
      }
      if (selectedFrames <= 0) {
        return fail(result, "No camera images selected for texturing");
      }
    }
    if ((objFile == null) || !objFile.exists()) {
      return fail(result, "Model export failed: OBJ file missing");
    }

    String mtlName = null;
    Set<String> textures = new LinkedHashSet<>();
    try (BufferedReader reader = new BufferedReader(new FileReader(objFile))) {
      String line;
      while ((line = reader.readLine()) != null) {
        String trimmed = line.trim();
        if (trimmed.startsWith("vt ")) {
          result.hasUv = true;
        } else if (trimmed.startsWith("mtllib ")) {
          result.hasMtllib = true;
          mtlName = trimmed.substring(7).trim();
        } else if (trimmed.startsWith("usemtl ")) {
          result.hasUseMtl = true;
        }
      }
    } catch (Exception e) {
      Log.e(AbstractActivity.TAG, "[TEXTURE][ERROR] Unable to read OBJ export", e);
      return fail(result, "Unable to read OBJ export");
    }

    Log.i(AbstractActivity.TAG, "[TEXTURE] OBJ has UV coordinates: " + yesNo(result.hasUv));
    if (!result.hasUv) {
      return fail(result, "Model exported without UV coordinates");
    }
    if (!result.hasMtllib || (mtlName == null) || mtlName.isEmpty()) {
      return fail(result, "Model exported without MTL reference");
    }
    if (!result.hasUseMtl) {
      return fail(result, "Model exported without material usage");
    }

    File mtlFile = new File(objFile.getParentFile(), mtlName);
    result.mtlFile = mtlFile;
    Log.i(AbstractActivity.TAG, "[TEXTURE] MTL generated: " + yesNo(mtlFile.exists()));
    if (!mtlFile.exists()) {
      return fail(result, "MTL file missing");
    }

    try (BufferedReader reader = new BufferedReader(new FileReader(mtlFile))) {
      String line;
      while ((line = reader.readLine()) != null) {
        String trimmed = line.trim();
        if (trimmed.startsWith("map_Kd ")) {
          result.hasMapKd = true;
          textures.add(trimmed.substring(7).trim());
        }
      }
    } catch (Exception e) {
      Log.e(AbstractActivity.TAG, "[TEXTURE][ERROR] Unable to read MTL export", e);
      return fail(result, "Unable to read MTL export");
    }

    if (!result.hasMapKd) {
      return fail(result, "Model exported without textures");
    }

    result.generatedTextureCount = textures.size();
    Log.i(AbstractActivity.TAG, "[TEXTURE] Texture files generated: " + result.generatedTextureCount);
    if (result.generatedTextureCount <= 0) {
      return fail(result, "Texture files missing");
    }

    for (String textureName : textures) {
      File textureFile = new File(objFile.getParentFile(), textureName);
      boolean exists = textureFile.exists();
      Log.i(AbstractActivity.TAG, "[TEXTURE] Texture file exists: " + yesNo(exists) + " (" + textureFile.getAbsolutePath() + ")");
      if (!exists) {
        return fail(result, "Texture files missing");
      }
    }

    result.ok = true;
    return result;
  }

  private static Result fail(Result result, String message) {
    result.errorMessage = message;
    Log.e(AbstractActivity.TAG, "[TEXTURE][ERROR] " + message);
    return result;
  }

  private static String yesNo(boolean value) {
    return value ? "yes" : "no";
  }
}
