cmake_minimum_required(VERSION 3.20)

project(pc_processor_native LANGUAGES CXX)

option(PC_PROCESSOR_ENABLE_PORTABLE_EXTRACTION "Enable experimental portable extraction targets" OFF)

add_library(pc_processor_native_stub INTERFACE)
target_compile_features(pc_processor_native_stub INTERFACE cxx_std_17)
target_include_directories(pc_processor_native_stub INTERFACE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

message(STATUS "pc_processor/native configured.")
message(STATUS "This directory prepares future Windows-native extraction of portable modules only.")

if(PC_PROCESSOR_ENABLE_PORTABLE_EXTRACTION)
    message(WARNING "Portable extraction targets are not implemented yet. This build is a scaffold only.")
endif()
