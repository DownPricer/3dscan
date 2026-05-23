# Audit format `.mat` Android vs parseur PC

## Ecriture Android

Fichier : `common/data/dataset.cc`

```cpp
void Dataset::WritePose(int index, std::vector<glm::mat4> pose) {
    for (int k = 0; k < MAX_CAMERA; k++)
        for (int i = 0; i < 4; i++)
            fprintf(file, "%f %f %f %f\n", pose[k][i][0], pose[k][i][1],
                                           pose[k][i][2], pose[k][i][3]);
}
```

Enumeration (`common/data/dataset.h`) :

```cpp
enum Pose { COLOR_CAMERA, OPENGL_CAMERA, SCREEN_CAMERA, MAX_CAMERA };
```

`MAX_CAMERA` vaut **3** : la boucle ecrit **3 matrices**, pas 4.

## Format exact

- **Type** : texte ASCII
- **Separateur** : espace entre valeurs, newline entre lignes
- **Precision** : `%f` (float C)
- **Layout GLM** : chaque ligne = une **colonne** de matrice 4x4 (`pose[k][i][0..3]`)
- **Ordre** : camera 0 (COLOR), camera 1 (OPENGL), camera 2 (SCREEN)
- **Lignes par fichier** : **12** (3 x 4 colonnes)
- **Valeurs par fichier** : **48** flottants

## Exemple reel `00000000.mat` (telephone)

```text
0.984808 0.010831 0.173311 0.000000
-0.016577 -0.987631 0.155915 0.000000
0.172856 -0.156420 -0.972447 0.000000
-0.058111 -0.007361 -0.006253 1.000000
... (4 lignes OPENGL_CAMERA)
... (4 lignes SCREEN_CAMERA)
```

12 lignes, 48 nombres.

## Format synthetique de test PC

Le dataset `pc_processor/test_datasets/synthetic_gui.dataset` contient **16 lignes** (4 matrices identite).

C'etait une approximation « 4 cameras » ; le vrai Android n'ecrit que 3 matrices.

## Difference qui cassait le parseur

Ancien parseur PC :

- exigeait **16 lignes minimum** (= 4 matrices)
- echouait avec le message `Pose file does not contain 16 rows for 4 matrices`

## Transformation point cloud

Reference : `common/exporter/exporter.cc`

1. Lire `.pcl` : points en repere **camera / local**
2. Filtrer `0 < z < 10` (profondeur camera)
3. `v = pose[COLOR_CAMERA] * vec4(x, y, z, 1)` → monde
4. Appliquer yaw depuis `rotation.txt` :

```cpp
vertices = (v.x * sin(-yaw) - v.z * cos(-yaw), v.y, v.x * cos(-yaw) + v.z * sin(-yaw));
```

Le processeur PC reproduit cette chaine avec la matrice **COLOR_CAMERA** (index 0).

## Parseur PC corrige

Module : `pc_processor/src/mat_parser.py`

- lit tous les flottants (lignes, espaces, commentaires `#`)
- regroupe par blocs de 16 → matrices 4x4 colonne-major
- accepte 1, 3 ou 4 matrices
- selectionne **COLOR_CAMERA** pour le PLY debug
