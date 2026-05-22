from music21 import converter

score = converter.parse("sheets/final.xml")
score.write("midi", fp="sheets/final.mid")