{
  "targets": [
    {
      "target_name": "Buenox_raw_input",
      "sources": [
        "src/Buenox_addon.cpp"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "libraries": [
        "-luser32.lib"
      ],
      "conditions": [
        ["OS=='win'", {
          "defines": [
            "WIN32_LEAN_AND_MEAN",
            "NOMINMAX"
          ]
        }]
      ]
    }
  ]
}